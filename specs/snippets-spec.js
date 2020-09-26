const mock = require('mock-fs');

const Snippets = require('../snippets')

describe('Snippets', () => {
  // userSnippetsPath
  // loadSnippetsFile()
  // loadUserSnippets()
  // loadPackage()
  // unloadPackage()
  //
  // activate
  // deactivate

  // snippets
  describe('snippets API', () => {
    const api = Snippets.snippets()
    /*
    userSnippetsPath: () => this.userSnippetsPath,
    snippetsByScopes: () => this.snippetsByScopes,
    */

    describe('userSnippetsPath', () => {
      waitsForPromise(() => atom.workspace.open('sample.js'))

      const editor = atom.workspace.getActiveTextEditor()

      it('returns a `Snippet`', () => {
        const snippet = api.parse('this is a snippet')

        expect(snippet).toBeInstanceOf(Snippet)
      })
    })

    describe('loaded', () => {
      describe('before activation', () => {
        it('should resolve to false', () => {
          expect(api.loaded).toBeInstanceOf(Promise)
          waitsForPromise(() => api.loaded.then(result => expect(result).toBe(false)))
        })
      })

      waitsForPromise(() => atom.packages.activatePackage('snippets-dev'))

      describe('after activation', () => {
        it('should resolve to true', () => {
          expect(api.loaded).toBeInstanceOf(Promise)
          waitsForPromise(() => api.loaded.then(result => expect(result).toBe(true)))
        })
      })

      waitsForPromise(() => atom.packages.deactivatePackage('snippets-dev'))

      describe('after deactivation', () => {
        it('should resolve to false', () => {
          expect(api.loaded).toBeInstanceOf(Promise)
          waitsForPromise(() => api.loaded.then(result => expect(result).toBe(false)))
        })
      })
    })

    describe('')
  })
})
