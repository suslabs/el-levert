CREATE TABLE "Groups" (
	"name"	TEXT,
	"level"	INTEGER,
	PRIMARY KEY("name")
);
---
CREATE TABLE "Users" (
	"id"	TEXT,
	"group"	TEXT,
	FOREIGN KEY("group") REFERENCES Groups("name")
);