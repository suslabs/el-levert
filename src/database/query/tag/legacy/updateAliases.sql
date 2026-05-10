UPDATE Tags SET hops = $newName WHERE hops = $name OR hops = name || ',' || $name OR hops LIKE name || ',' || $name || ',%';
