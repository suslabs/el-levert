SELECT name FROM Tags
WHERE (
    $flag IS NULL
    OR ($flag > 0 AND (blob_to_int(type) & $flag) = $flag)
    OR ($flag < 0 AND (blob_to_int(type) & (-$flag)) = 0)
);
