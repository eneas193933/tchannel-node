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

/* function User() {
 *     this.id = 0;
 *     this.name = '';
 * }
 *
 * User.prototype.reset =
 * function reset() {
 *     this.id = 0;
 *     this.name = '';
 * };
 *
 * ObjectPool.setup(User);
 *
 * var user = User.alloc();
 * user.id = 1;
 * user.name = 'bob';
 * // ...
 * user.free();
 */

// TODO: add monitoring and maybe pruning

function ObjectPool(Type) {
    this.Type = Type;
    this.outstanding = 0;
    this.reused = 0;
    this.newed = 0;
    this.freelist = [];
    this.free = this.justFree;
    if (typeof this.Type.prototype.reset === 'function') {
        this.free = this.resetAndFree;
    }
}

ObjectPool.Pools = {};

ObjectPool.setup =
function setup(Type) {
    var pool = new ObjectPool(Type);
    Type.pool = pool;
    Type.alloc = alloc;

    // TODO: useful? Type.prototype._objectPoolIsFreed = false;
    Type.prototype.free = function freeThisObj() {
        pool.free(this);
    };

    ObjectPool.Pools[Type.name] = pool;
    return pool;

    function alloc() {
        var obj = pool.get();
        obj._objectPoolIsFreed = false;
        return obj;
    }
};

ObjectPool.prototype.get =
function get() {
    this.outstanding++;
    if (this.freelist.length) {
        this.reused++;
        return this.freelist.shift();
    }
    this.newed++;
    return new this.Type();
};

ObjectPool.prototype.justFree =
function justFree(obj) {
    assert(!obj._objectPoolIsFreed, 'object pool double free');
    obj._objectPoolIsFreed = true;
    this.outstanding--;
    this.freelist.push(obj);
};

ObjectPool.prototype.resetAndFree =
function resetAndFree(obj) {
    assert(!obj._objectPoolIsFreed, 'object pool double free');
    obj._objectPoolIsFreed = true;
    obj.reset();
    this.outstanding--;
    this.freelist.push(obj);
};

module.exports = ObjectPool;
