let parser
try {
  parser = require('./snippet-body')
} catch (error) {
  const { allowUnsafeEval } = require('loophole')
  const fs = require('fs-plus')
  const peg = require('pegjs')

  const grammarSrc = fs.readFileSync(require.resolve('./snippet-body.pegjs'), 'utf8')
  parser = null
  allowUnsafeEval(() => parser = peg.generate(grammarSrc))
}

module.exports = parser
