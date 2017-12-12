/** @babel */

import { Range } from 'atom';
import Insertion from './insertion';

// A tab stop:
// * belongs to a snippet
// * has an index (one tab stop per index)
// * has multiple Insertions
class TabStop {
  constructor ({ snippet, index, insertions }) {
    this.insertions = insertions || [];
    Object.assign(this, { snippet, index });
  }

  addInsertion ({ range, substitution }) {
    this.insertions.push(new Insertion({ range, substitution }));
    this._sort();
  }

  _sort () {
    this.insertions = this.insertions.sort((i1, i2) => {
      return i1.range.start.compare(i2.range.start);
    });
    this.initial = this.insertions[0];
  }

  copyWithIndent (indent) {
    let { snippet, index, insertions } = this;
    let newInsertions = insertions.map(insertion => {
      let { range, substitution } = insertion;
      let newRange = Range.fromObject(range, true);
      if (newRange.start.row) {
        newRange.start.column += indent.length;
        newRange.end.column += indent.length;
      }
      return new Insertion({
        range: newRange,
        substitution
      });
    });

    return new TabStop({
      snippet,
      index,
      insertions: newInsertions
    });
  }
}

export default TabStop;
