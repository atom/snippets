const { CompositeDisposable } = require('atom')

const Modifier = require('./modifier')

module.exports = class Choice extends Modifier {
  constructor (choices) {
    super()

    this.choices = choices
  }

  create ([Construct, ...args]) {
    class Choice extends Construct {
      constructor ({ choices: [first, ...rest] }, ...args) {
        super(...args)

        this.default = first
        // Move the default last, so choice cycling works as expected
        this.choices = [...rest, first]
      }

      activate (marker, cursor, mirror, target, command) {
        // Don't bother if a mirror, the marker won't get iterated over
        if (!mirror) {
          const disposables = new CompositeDisposable()

          const cycle = `snippets:next-choice-${marker.id}`

          const choices = {
            choices: this.choices,
            iterator: this.choices.values(),
            next () {
              const iteration = this.iterator.next()
              const { value } = iteration.done
                ? (this.iterator = this.choices.values()).next()
                : iteration
              cursor.selection.insertText(value, { select: true })
            }
          }

          disposables.add(
            atom.keymaps.add(module.filename, { [target]: { 'shift-tab': cycle } }),
            atom.commands.add(target, cycle, event => choices.next()),
            cursor.onDidChangePosition(({ newBufferPosition }) => {
              if (!marker.getRange().containsPoint(newBufferPosition)) {
                disposables.dispose()
              }
            }))
        }
        return super.activate(marker, cursor, mirror, target, command)
      }

      expand (cursor, tabstops, variables) {
        if (!(this.identifier in variables)) {
          this.mark({ tabstops, ...this.insert(cursor, this.default) })
        } else {
          super.expand(cursor, tabstops, variables)
        }
      }

      toString () {
        return this.default.toString()
      }
    }

    return new Choice(this, ...args)
  }
}
