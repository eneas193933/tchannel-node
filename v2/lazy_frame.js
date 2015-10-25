// Copyright (c) 2015 Uber Technologies, Inc.
//
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

var assert = require('assert');
var bufrw = require('bufrw');
var errors = require('../errors');

var ObjectPool = require('../lib/object-pool.js');
var Frame = require('./frame.js');

module.exports = LazyFrame;

function LazyFrame() {
    var self = this;

    self.isLazy = true;
    self.size = 0;
    self.type = 0;
    self.id = 0;
    self.buffer = null;
    self.body = null;
    self.bodyRW = null;
}

LazyFrame.prototype.reset =
function reset() {
    var self = this;

    // TODO: free self.body

    self.size = 0;
    self.type = 0;
    self.id = 0;
    self.buffer = null;
    self.body = null;
    self.bodyRW = null;
};

ObjectPool.setup(LazyFrame);

// size:2 type:1 reserved:1 id:4 reserved:8 ...
LazyFrame.RW = bufrw.Base(lazyFrameLength, readLazyFrameFrom, writeLazyFrameInto);

LazyFrame.TypeOffset = 2;
LazyFrame.IdOffset = 2 + 1 + 1;
LazyFrame.BodyOffset = Frame.Overhead;

LazyFrame.prototype.setId = function setId(id) {
    var self = this;
    assert.ok(self.buffer, 'must have a buffer supplied');
    self.id = id;
    self.buffer.writeUInt32BE(self.id, LazyFrame.IdOffset);
};

LazyFrame.prototype.readBody = function readBody() {
    var self = this;
    if (self.body) {
        return bufrw.ReadResult.just(self.body);
    }

    if (!self.buffer) {
        // TODO: typed error
        return bufrw.ReadResult.error(new Error('no buffer to read from'));
    }

    var res = self.bodyRW.readFrom(self.buffer, LazyFrame.BodyOffset);
    if (!res.err) {
        self.body = res.value;
    }

    return res;
};

function lazyFrameLength(lazyFrame) {
    return bufrw.LengthResult.just(lazyFrame.size);
}

function readLazyFrameFrom(buffer, offset) {
    var start = offset;
    var lazyFrame = LazyFrame.alloc();

    // size:2:
    lazyFrame.size = buffer.readUInt16BE(offset);
    offset += lazyFrame.size;
    lazyFrame.buffer = buffer.slice(start, offset);

    // type:1
    lazyFrame.type = lazyFrame.buffer.readUInt8(LazyFrame.TypeOffset);

    // id:4
    lazyFrame.id = lazyFrame.buffer.readUInt32BE(LazyFrame.IdOffset);

    lazyFrame.bodyRW = Frame.Types[lazyFrame.type].RW;

    if (!lazyFrame.bodyRW) {
        lazyFrame.free();
        return bufrw.ReadResult.error(errors.InvalidFrameTypeError({
            typeNumber: lazyFrame.type
        }), offset + LazyFrame.TypeOffset);
    }

    return bufrw.ReadResult.just(offset, lazyFrame);
}

function writeLazyFrameInto(lazyFrame, buffer, offset) {
    if (!lazyFrame.buffer) {
        return bufrw.WriteResult.error(errors.CorruptWriteLazyFrame({
            context: 'missing buffer'
        }));
    }

    var remain = buffer.length - offset;
    if (lazyFrame.size > remain) {
        return bufrw.WriteResult.shortError(lazyFrame.size, remain, offset);
    }

    offset += lazyFrame.buffer.copy(buffer, offset, 0, lazyFrame.size);
    return bufrw.WriteResult.just(offset);
}
