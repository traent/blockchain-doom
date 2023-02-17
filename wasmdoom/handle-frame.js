var PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

var CHUNK_WRAPPER_SIZE = 12;

var crcTable = new Int32Array(256);
for (var i = 0; i < 256; i++) {
  var c = i;
  for (var h = 0; h < 8; h++) {
    if (c & 1) {
      c = 0xedB88320 ^ ((c >> 1) & 0x7fffffff);
    } else {
      c = (c >> 1) & 0x7fffffff;
    }
  }
  crcTable[i] = c;
}

function crc32(data, start, end) {
  var crc = -1;
  for (var i = start; i < end; i++) {
    var a = (crc ^ data[i]) & 0xff;
    var b = crcTable[a];
    crc = (crc >>> 8) ^ b;
  }
  return crc ^ -1;
}

function writePngChunk(type, body, data, offset) {
  var p = offset;
  var len = body.length;

  data[p] = len >> 24 & 0xff;
  data[p + 1] = len >> 16 & 0xff;
  data[p + 2] = len >> 8 & 0xff;
  data[p + 3] = len & 0xff;
  p += 4;

  data[p] = type.charCodeAt(0) & 0xff;
  data[p + 1] = type.charCodeAt(1) & 0xff;
  data[p + 2] = type.charCodeAt(2) & 0xff;
  data[p + 3] = type.charCodeAt(3) & 0xff;
  p += 4;

  data.set(body, p);
  p += body.length;

  var crc = crc32(data, offset + 4, p);

  data[p] = crc >> 24 & 0xff;
  data[p + 1] = crc >> 16 & 0xff;
  data[p + 2] = crc >> 8 & 0xff;
  data[p + 3] = crc & 0xff;
}

function adler32(data, start, end) {
  var a = 1;
  var b = 0;
  for (var i = start; i < end; ++i) {
    a = (a + (data[i] & 0xff)) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}

export function encode(imgData) {
  var width = imgData.width;
  var height = imgData.height;
  var bitDepth, colorType, lineSize;
  var bytes = imgData.data;

  colorType = 6;
  bitDepth = 8;
  lineSize = width * 4;

  // prefix every row with predictor 0
  var literals = new Uint8Array((1 + lineSize) * height);
  var offsetLiterals = 0, offsetBytes = 0;
  var y, i;
  for (y = 0; y < height; ++y) {
    literals[offsetLiterals++] = 0; // no prediction
    literals.set(bytes.subarray(offsetBytes, offsetBytes + lineSize),
      offsetLiterals);
    offsetBytes += lineSize;
    offsetLiterals += lineSize;
  }

  var ihdr = new Uint8Array([
    width >> 24 & 0xff,
    width >> 16 & 0xff,
    width >> 8 & 0xff,
    width & 0xff,
    height >> 24 & 0xff,
    height >> 16 & 0xff,
    height >> 8 & 0xff,
    height & 0xff,
    bitDepth, // bit depth
    colorType, // color type
    0x00, // compression method
    0x00, // filter method
    0x00 // interlace method
  ]);

  var len = literals.length;
  var maxBlockLength = 0xFFFF;

  var deflateBlocks = Math.ceil(len / maxBlockLength);
  var idat = new Uint8Array(2 + len + deflateBlocks * 5 + 4);
  var pi = 0;
  idat[pi++] = 0x78; // compression method and flags
  idat[pi++] = 0x9c; // flags

  var pos = 0;
  while (len > maxBlockLength) {
    // writing non-final DEFLATE blocks type 0 and length of 65535
    idat[pi++] = 0x00;
    idat[pi++] = 0xff;
    idat[pi++] = 0xff;
    idat[pi++] = 0x00;
    idat[pi++] = 0x00;
    idat.set(literals.subarray(pos, pos + maxBlockLength), pi);
    pi += maxBlockLength;
    pos += maxBlockLength;
    len -= maxBlockLength;
  }

  // writing non-final DEFLATE blocks type 0
  idat[pi++] = 0x01;
  idat[pi++] = len & 0xff;
  idat[pi++] = len >> 8 & 0xff;
  idat[pi++] = (~len & 0xffff) & 0xff;
  idat[pi++] = (~len & 0xffff) >> 8 & 0xff;
  idat.set(literals.subarray(pos), pi);
  pi += literals.length - pos;

  var adler = adler32(literals, 0, literals.length); // checksum
  idat[pi++] = adler >> 24 & 0xff;
  idat[pi++] = adler >> 16 & 0xff;
  idat[pi++] = adler >> 8 & 0xff;
  idat[pi++] = adler & 0xff;

  // PNG will consists: header, IHDR+data, IDAT+data, and IEND.
  var pngLength = PNG_HEADER.length + (CHUNK_WRAPPER_SIZE * 3) +
    ihdr.length + idat.length;
  var data = new Uint8Array(pngLength);
  var offset = 0;
  data.set(PNG_HEADER, offset);
  offset += PNG_HEADER.length;
  writePngChunk('IHDR', ihdr, data, offset);
  offset += CHUNK_WRAPPER_SIZE + ihdr.length;
  writePngChunk('IDATA', idat, data, offset);
  offset += CHUNK_WRAPPER_SIZE + idat.length;
  writePngChunk('IEND', new Uint8Array(0), data, offset);

  return data;
}

export function handleFrame(imgData) {
  saveFile('test.png', encode(imgData));
}
