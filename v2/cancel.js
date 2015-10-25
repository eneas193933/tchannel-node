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

var bufrw = require('bufrw');
var Tracing = require('./tracing');

// ttl:4 tracing:25 why~2
function Cancel(ttl, tracing, why) {
    var self = this;
    self.type = Cancel.TypeCode;
    self.ttl = ttl || 0;
    self.tracing = tracing || Tracing.emptyTracing;
    self.why = why || '';
}

Cancel.TypeCode = 0xc0;

Cancel.RW = bufrw.Base(cancelLength, readCancelInto, writeCancelInto);

function cancelLength(body) {
    var length = 0;

    // ttl:4
    length += bufrw.UInt32BE.width;

    // tracing:25
    length += 25; // Tracing.RW

    // why~2
    var res = bufrw.str2.byteLength(body.why);
    if (!res.err) res.length += length;

    return res;
}

function readCancelInto(buffer, offset) {
    var res;
    var body = new Cancel();

    // ttl:4
    res = bufrw.UInt32BE.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.ttl = res.value;

    // tracing:25
    res = Tracing.RW.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.tracing = res.value;

    // why~2
    res = bufrw.str2.readFrom(buffer, offset);
    if (res.err) return res;
    offset = res.offset;
    body.why = res.value;

    return res;
}

function writeCancelInto(body, buffer, offset) {
    var res;

    // ttl:4
    res = bufrw.UInt32BE.writeInto(body.ttl, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // tracing:25
    res = Tracing.RW.writeInto(body.tracing, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // why~2
    return bufrw.str2.writeInto(body.why, buffer, offset);
}

module.exports = Cancel;
