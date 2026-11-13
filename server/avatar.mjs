/* 大了么 · 头像图片校验
 *
 * 只接受 PNG / JPEG / WebP 的 base64 data URL，并且：
 *  - 不信任客户端声明的 MIME，用文件头 magic bytes 反查真实类型；
 *  - 拒绝 SVG（可能携带脚本）、HTML 与其它可执行文件；
 *  - 校验像素尺寸，防止超长宽图片在浏览器解码时造成内存放大；
 *  - 限制解码后体积，避免把数据库和每次响应撑大。
 */
import { randomBytes } from 'node:crypto';

import { config } from './config.mjs';
import { HttpError } from './security.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_DIMENSION = 1024;

function pngDimensions(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { type: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegDimensions(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buf.length) break;
    /* SOF0–SOF15，排除 DHT(0xc4) / JPG(0xc8) / DAC(0xcc) */
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        type: 'image/jpeg',
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { type: 'image/jpeg', width: 0, height: 0 };
}

function webpDimensions(buf) {
  if (
    buf.length < 30 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      type: 'image/webp',
      width: buf.readUIntLE(24, 3) + 1,
      height: buf.readUIntLE(27, 3) + 1,
    };
  }
  if (chunk === 'VP8 ' && buf[23] === 0x9d && buf[24] === 0x01 && buf[25] === 0x2a) {
    return {
      type: 'image/webp',
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && buf[20] === 0x2f) {
    const bits = buf.readUInt32LE(21);
    return {
      type: 'image/webp',
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1,
    };
  }
  return { type: 'image/webp', width: 0, height: 0 };
}

function detectImage(buf) {
  return pngDimensions(buf) || jpegDimensions(buf) || webpDimensions(buf);
}

/** 校验并规范化上传的头像，返回可直接写入数据库的字段 */
export function parseAvatarImage(value) {
  if (typeof value !== 'string') {
    throw new HttpError(400, '请选择一张图片', 'BAD_AVATAR');
  }
  /* 先按 base64 膨胀后的长度粗筛，避免对超大字符串做解码 */
  const maxEncoded = Math.ceil((config.avatarMaxBytes * 4) / 3) + 256;
  if (value.length > maxEncoded) {
    throw new HttpError(413, '图片过大，请换一张更小的图片', 'AVATAR_TOO_LARGE');
  }
  const match = DATA_URL_RE.exec(value.trim());
  if (!match) {
    throw new HttpError(415, '仅支持 PNG、JPG 或 WebP 图片', 'UNSUPPORTED_IMAGE');
  }
  const declared = match[1];
  const encoded = match[2];
  const data = Buffer.from(encoded, 'base64');
  /* Buffer.from 对非法 base64 会静默截断，这里回编码比对，拒绝夹带垃圾字符 */
  if (data.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new HttpError(400, '图片内容损坏，请重新选择', 'BAD_AVATAR');
  }
  if (!data.length || data.length > config.avatarMaxBytes) {
    throw new HttpError(413, '图片过大，请换一张更小的图片', 'AVATAR_TOO_LARGE');
  }

  const detected = detectImage(data);
  if (!detected || detected.type !== declared) {
    throw new HttpError(415, '图片内容与格式不符', 'IMAGE_FORMAT_MISMATCH');
  }
  if (
    detected.width < 1 || detected.height < 1 ||
    detected.width > MAX_DIMENSION || detected.height > MAX_DIMENSION ||
    detected.width * detected.height > MAX_DIMENSION * MAX_DIMENSION
  ) {
    throw new HttpError(400, '图片尺寸不合法', 'BAD_IMAGE_SIZE');
  }

  return {
    mime: declared,
    data,
    /* 每次上传换一个版本串，让 <img> URL 变化，绕过浏览器/CDN 缓存 */
    version: randomBytes(9).toString('base64url'),
    width: detected.width,
    height: detected.height,
  };
}
