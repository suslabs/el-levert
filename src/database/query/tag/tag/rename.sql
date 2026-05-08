UPDATE Tags SET aliasName = $aliasName, name = $name, lastEdited = $lastEdited, type = $type WHERE name = $oldName;
