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

  isValid () {
    let any = this.insertions.some(insertion => insertion.isTransformation());
    if (!any) return true;
    let all = this.insertions.every(insertion => insertion.isTransformation());
    // If there are any transforming insertions, there must be at least one
    // non-transforming insertion to act as the primary.
    return !all;
  }

  addInsertion ({ range, substitution }) {
    let insertion = new Insertion({ range, substitution });

    if (this.insertions.length === 0) {
      this.insertions.push(insertion);
      return;
    }

    let i;
    for (i = 0; i < this.insertions.length; i++) {
      let lInsertion = this.insertions[i];
      let rInsertion = this.insertions[i + 1];
      if (!rInsertion) { break; }
      let lCompare = insertion.range.start.compare(lInsertion.range.start);
      let rCompare = insertion.range.start.compare(rInsertion.range.start);
      if (lCompare < 0 && rCompare > 0) { break; }
    }

    this.insertions.splice(i, 0, insertion);
    // Ensure the first item in the array is a non-transforming insertion.
    this.initial = this.insertions.find(insertion => !insertion.isTransformation());
    this.insertions.splice(this.insertions.indexOf(this.initial), 1);
    this.insertions.unshift(this.initial);
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
