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

// ttl:4 tracing:25
function Claim(ttl, tracing) {
    var self = this;
    self.type = Claim.TypeCode;
    self.ttl = ttl || 0;
    self.tracing = tracing || Tracing.emptyTracing;
}

Claim.TypeCode = 0xc1;

Claim.RW = bufrw.Base(claimLength, readClaimFrom, writeClaimInto);

function claimLength(body) {
    var length = 0;

    // ttl:4
    length += bufrw.UInt32BE.width;

    // tracing:25
    length += 25; // Tracing.RW

    return bufrw.LengthResult.just(length);
}

function readClaimFrom(buffer, offset) {
    var res;
    var body = new Claim();

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

    res.value = body;
    return res;
}

function writeClaimInto(body, buffer, offset) {
    var res;

    // ttl:4
    res = bufrw.UInt32BE.writeInto(body.ttl, buffer, offset);
    if (res.err) return res;
    offset = res.offset;

    // tracing:25
    return Tracing.RW.writeInto(body.tracing, buffer, offset);
}

module.exports = Claim;
