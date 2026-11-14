const FB = (() => {
  const checksum = bytes => (-bytes.reduce((sum, byte) => sum + byte, 0)) & 127;
  function decode(data) {
    const legacy = data[2] < 16 && data[3] === 12;
    if (data[0] !== 240 || data[1] !== 67 || data.at(-1) !== 247 ||
        (!legacy && !(data[2] === 117 && data[3] < 16 && data[4] === 0 && data[5] === 0 && data[6] <= 6))) {
      throw Error('Expected an FB-01 voice bank.');
    }
    let offset = legacy ? 4 : 7;
    function block(size) {
      const count = data[offset++] * 128 + data[offset++];
      const payload = data.slice(offset, offset + size * 2);
      offset += size * 2;
      if (count !== size * 2 || payload.length !== size * 2 ||
          payload.some(value => value > 15) || checksum(payload) !== data[offset++]) {
        throw Error('Invalid FB-01 data block at byte ' + offset + '.');
      }
      return Uint8Array.from({length:size}, (_, index) => payload[index*2] | payload[index*2+1] << 4);
    }
    // Some legacy dumps group all 48 voices into one block.
    const header = block(32);
    const voices = [];
    if (legacy && data[offset] === 48) {
      const packed = block(48 * 64);
      for (let i=0; i<48; i++) voices.push(packed.slice(i*64, (i+1)*64));
    } else {
      for (let i=0; i<48; i++) voices.push(block(64));
    }
    if (offset !== data.length - 1) throw Error('Unexpected data after the last voice.');
    return {header, voices, original:data.slice(), channel: data[legacy ? 2 : 3], slot:legacy ? 0 : data[6]};
  }
  function encode(bank, channel = bank.channel, slot = bank.slot) {
    const bytes = [240,67,117,channel,0,0,slot];
    for (const block of [bank.header, ...bank.voices]) {
      const nibbles = Array.from(block).flatMap(byte => [byte & 15, byte >> 4]);
      bytes.push(nibbles.length >> 7, nibbles.length & 127, ...nibbles, checksum(nibbles));
    }
    return Uint8Array.from([...bytes,247]);
  }
  const name = (bytes, length) => String.fromCharCode(...bytes.slice(0,length)).replace(/[\x00-\x1f\x7f-\xff]/g,' ').trim();
  return {decode, encode, name};
})();
if (typeof module !== 'undefined') module.exports = FB;
