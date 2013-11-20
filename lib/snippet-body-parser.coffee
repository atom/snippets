PEG = require 'pegjs'
{fs} = require 'atom'
grammarSrc = fs.readFileSync(require.resolve('./snippet-body.pegjs'), 'utf8')
module.exports = PEG.buildParser(grammarSrc, trackLineAndColumn: true)
