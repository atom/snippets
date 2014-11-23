
fs     = require 'fs'
path   = require 'path'
moment = require 'moment'

module.exports = (varName) ->
  if not varName then return ''
  
  editor   = atom.workspace.getActiveTextEditor()
  filePath = editor.getPath()
  project  = atom.project
  for projectPath in project.getPaths() 
    if filePath[0...projectPath.length] is projectPath then break
  
  varNameBody = varName[1...]
  switch varName[0]
    when '-'
      moment().format(varNameBody)
    
    when ':'
      try
        value = JSON.parse fs.readFileSync path.join(projectPath, 'package.json')
      catch e
        return ' <unable to load package.json for variable: "' + varName + '"> '
      for propName in varNameBody.split ':'
        if not (value = value[propName])
          return ' <package.json does not have property "' + varNameBody + '"> '
      if typeof value isnt 'string'
        return ' <expected string for package.json property "' + varNameBody + '"> '
      value
    
    when '/'
      projectRel = filePath[projectPath.length+1...]
      switch varNameBody
        when 'filename'    then               filePath
        when 'dirname'     then path.dirname  filePath
        when 'basename'    then path.basename filePath
        when 'extname'     then path.extname  filePath
        when 'sep'         then path.sep
        when 'delimiter'   then path.delimiter
        when 'project'     then projectPath
        when 'filenamerel' then projectRel
        when 'dirnamerel'  then path.dirname projectRel
        when 'line'        then editor.getCursorBufferPosition().row + 1
        else ' <unknown / variable: "' + varName + '"> '

    else ' <prefix not one of "-:/" in variable "' + varName + '"> '