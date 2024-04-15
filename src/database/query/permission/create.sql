CREATE TABLE "Groups" (
	"name"	TEXT,
	"level"	INTEGER,
	PRIMARY KEY("name")
);
---
CREATE TABLE "Users" (
	"id"	INTEGER,
	"user"	TEXT,
	"group"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("group") REFERENCES Groups("name")
);