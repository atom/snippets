function wrap (manager, callbacks) {
  return new Proxy(manager, {
    get (target, name) {
      if (name in callbacks) {
        callbacks[name]()
      }
      return target[name]
    }
  })
}

class SnippetHistoryProvider {
  constructor (manager) {
    this.manager = manager
  }

  undo (...args) {
    return this.manager.undo(...args)
  }

  redo (...args) {
    return this.manager.redo(...args)
  }
}

module.exports = wrap
