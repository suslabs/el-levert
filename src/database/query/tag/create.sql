CREATE TABLE "Tags" (
    "hops"	TEXT,
    "name"	TEXT,
    "body"	TEXT,
    "owner"	TEXT,
    "args"	TEXT,
    "registered"	INTEGER,
    "lastEdited"	INTEGER,
    "type"	INTEGER
);
---
CREATE TABLE "Quotas" (
    "id"	TEXT,
    "quota"	REAL
);