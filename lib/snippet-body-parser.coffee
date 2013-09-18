PEG = require 'pegjs'
{fs} = require 'atom-api'
grammarSrc = fsUtils.read(require.resolve('./snippet-body.pegjs'))
module.exports = PEG.buildParser(grammarSrc, trackLineAndColumn: true)
