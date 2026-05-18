SELECT COUNT(*) AS count FROM Tags
WHERE ($user IS NULL OR owner = $user)
    AND (
        $flag IS NULL
        OR ($flag > 0 AND (blob_to_int(type) & $flag) = $flag)
        OR ($flag < 0 AND (blob_to_int(type) & (-$flag)) = 0)
    );
