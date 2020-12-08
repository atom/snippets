const { CompositeDisposable } = require('atom')

const Modifier = require('./modifier')

module.exports = class Choice extends Modifier {
  constructor (choices) {
    super()

    this.choices = choices
    // The "first" and therefore default values is last in the list so that
    // choice cycling starts from the second choice
    this.default = choices[choices.length - 1]
  }

  modify (construct) {
    class Choice extends construct.constructor {
      activate (editor, cursor, stop, mirror) {
        super.activate(editor, cursor, stop, mirror)
        // Don't bother if a mirror, the marker won't get iterated over
        if (mirror === stop) {
          const disposables = new CompositeDisposable()

          const target = 'atom-text-editor:not([mini])'
          const cycle = `snippets:next-choice-${stop.id}`

          const choices = {
            choices: this.choices,
            iterator: this.choices.values(),
            next () {
              const iteration = this.iterator.next()
              const { value } = iteration.done
                ? (this.iterator = this.choices.values()).next()
                : iteration
              editor.getBuffer().setTextInRange(stop.getBufferRange(), value)
              cursor.selection.setBufferRange(stop.getBufferRange())
            }
          }

          // What happens when the user clicks inside the choice, resulting in it nolonger being selected
          disposables.add(
            atom.keymaps.add(module.filename, { [target]: { 'shift-tab': cycle } }),
            atom.commands.add(target, cycle, event => choices.next()),
            cursor.onDidChangePosition(({ newBufferPosition }) => {
              if (!stop.getBufferRange().containsPoint(newBufferPosition)) {
                disposables.dispose()
              }
            }))
        }
      }

      expand (editor, cursor, tabstops, variables) {
        if (!(this.identifier in variables)) {
          this.mark({ tabstops, ...this.insert(editor, cursor, this.default) })
        } else {
          super.expand(editor, cursor, tabstops, variables)
        }
      }

      toString () {
        return this.default.toString()
      }
    }

    return Object.assign(new Choice(construct), this)
  }
}
