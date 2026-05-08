UPDATE Tags SET aliasName = $aliasName, name = $name, body = $body, owner = $owner, args = $args, registered = $registered, lastEdited = $lastEdited, type = $type WHERE name = $tagName;
