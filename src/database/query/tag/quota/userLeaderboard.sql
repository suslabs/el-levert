SELECT
    count, quota,
    (SELECT COUNT(*) + 1 FROM Quotas WHERE count > q.count AND count > 0) AS countPos,
    (SELECT COUNT(*) + 1 FROM Quotas WHERE quota > q.quota AND quota > 0) AS sizePos
FROM Quotas q
WHERE user = $user AND count > 0;
