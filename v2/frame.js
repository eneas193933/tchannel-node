// Copyright (c) 2015 Uber Technologies, Inc.

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

Frame.Overhead = 0x10;
Frame.MaxSize = 0xffff;
Frame.MaxBodySize = Frame.MaxSize - Frame.Overhead;
Frame.MaxId = 0xfffffffe;
Frame.NullId = 0xffffffff;

Frame.Types = {};
module.exports = Frame;

var bufrw = require('bufrw');
var errors = require('../errors');
var ObjectPool = require('../lib/object-pool.js');

var Types = require('./index.js').Types;

/* jshint maxparams:5 */

function Frame() {
    var self = this;

    self.isLazy = false;
    self.size = 0;
    self.id = Frame.NullId;
    self.type = 0;
    self.body = null;
}

Frame.prototype.reset =
function reset() {
    var self = this;

    if (self.body) {
        self.body.free();
    }
    self.body = null;

    self.size = 0;
    self.id = Frame.NullId;
    self.type = 0;
};

ObjectPool.setup(Frame);

// size:2: type:1 reserved:1 id:4 reserved:8 ...
Frame.RW = bufrw.Base(frameLength, readFrameFrom, writeFrameInto);

function frameLength(frame) {
    var body = frame.body;
    var bodyRW = body.constructor.RW;

    var length = 0;
    length += bufrw.UInt16BE.width; // size:2:
    length += bufrw.UInt8.width;    // type:1
    length += 1;                    // reserved:1
    length += bufrw.UInt32BE.width; // id:4
    length += 8;                    // reserved:8 ...

    var res = bodyRW.byteLength(body);
    if (!res.err) {
        res.length += length;
    }
    return res;
}

function readFrameFrom(buffer, offset) {
    var frame = Frame.alloc();

    var res;

    res = bufrw.UInt16BE.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    frame.size = res.value;

    res = bufrw.UInt8.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    frame.type = res.value;

    var BodyType = Frame.Types[frame.type];
    if (!BodyType) {
        var err = errors.InvalidFrameTypeError({
            typeNumber: frame.type
        });
        frame.free();
        return bufrw.ReadResult.error(err, offset - 1);
    }

    offset += 1;

    res = bufrw.UInt32BE.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    frame.id = res.value;

    offset += 8;

    res = BodyType.RW.readFrom(buffer, offset);
    if (res.err) {
        if (frame.type === Types.CallRequest ||
            frame.type === Types.CallRequestCont
        ) {
            // TODO: wrapped?
            res.err.frameId = frame.id;
        }
        frame.free();
        return res;
    }
    offset = res.offset;
    frame.body = res.value;

    res.value = frame;
    return res;
}

function writeFrameInto(frame, buffer, offset) {
    var body = frame.body;
    var bodyRW = body.constructor.RW;

    var start = offset;
    var end = offset;
    var res;

    // skip size, write later
    offset += bufrw.UInt16BE.width;

    res = bufrw.UInt8.writeInto(frame.type, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    end = offset + 1;
    buffer.fill(0, offset, end);
    offset = end;

    res = bufrw.UInt32BE.writeInto(frame.id, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    end = offset + 8;
    buffer.fill(0, offset, end);
    offset = end;

    res = bodyRW.writeInto(body, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    frame.size = res.offset - start;
    res = bufrw.UInt16BE.writeInto(frame.size, buffer, start);
    if (res.err) return res;
    res.offset = offset;

    return res;
}

Frame.fromBuffer = function fromBuffer(buffer) {
    return bufrw.fromBuffer(Frame.RW, buffer, 0);
};

Frame.prototype.byteLength = function byteLength() {
    var self = this;
    return bufrw.byteLength(Frame.RW, self);
};

Frame.prototype.intoBuffer = function intoBuffer(buffer) {
    var self = this;
    return bufrw.intoBuffer(Frame.RW, self, buffer);
};

Frame.prototype.toBuffer = function toBuffer() {
    var self = this;
    return bufrw.toBuffer(Frame.RW, self);
};
