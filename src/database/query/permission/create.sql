CREATE TABLE "Groups" (
    "name"	TEXT,
    "level"	INTEGER
);
---
CREATE TABLE "Users" (
    "group"	TEXT,
    "id"	TEXT
);