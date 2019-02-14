const {Range} = require('atom')
const Insertion = require('./insertion')

// A tab stop:
// * belongs to a snippet
// * has an index (one tab stop per index)
// * has multiple Insertions
class TabStop {
  constructor ({ snippet, index, insertions, transformResolver }) {
    this.insertions = insertions || []
    this.transformResolver = transformResolver
    Object.assign(this, { snippet, index })
  }

  isValid () {
    let any = this.insertions.some(insertion => insertion.isTransformation())
    if (!any) return true
    let all = this.insertions.every(insertion => insertion.isTransformation())
    // If there are any transforming insertions, there must be at least one
    // non-transforming insertion to act as the primary.
    return !all
  }

  addInsertion (insertionParams) {
    let insertion = new Insertion({...insertionParams, transformResolver: this.transformResolver})
    let insertions = this.insertions
    insertions.push(insertion)
    insertions = insertions.sort((i1, i2) => {
      return i1.range.start.compare(i2.range.start)
    })
    let initial = insertions.find(insertion => !insertion.isTransformation())
    if (initial) {
      insertions.splice(insertions.indexOf(initial), 1)
      insertions.unshift(initial)
    }
    this.insertions = insertions
  }
}

module.exports = TabStop
