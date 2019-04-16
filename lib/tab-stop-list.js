const TabStop = require('./tab-stop')

class TabStopList {
  constructor (snippet) {
    this.snippet = snippet
    this.list = {}
  }

  get length () {
    return Object.keys(this.list).length
  }

  get hasEndStop () {
    return !!this.list[Infinity]
  }

  findOrCreate ({index, snippet}) {
    if (!this.list[index]) {
      this.list[index] = new TabStop({index, snippet, transformResolver: this.snippet.transformResolver})
    }
    return this.list[index]
  }

  forEachIndex (iterator) {
    const indices = Object.keys(this.list).sort((a1, a2) => a1 - a2)
    indices.forEach(iterator)
  }

  getInsertions () {
    const results = []
    this.forEachIndex(index => {
      results.push(...this.list[index].insertions)
    })
    return results
  }

  getHighestIndex () {
    // the keys are strings...
    return Object.keys(this.list).reduce((m, i) => {
      const index = parseInt(i)
      return index > m
        ? index
        : m
    }, 0)
  }

  toArray () {
    const results = []
    this.forEachIndex(index => {
      const tabStop = this.list[index]
      if (tabStop.isValid()) {
        results.push(tabStop)
      }
    })
    return results
  }
}

module.exports = TabStopList
