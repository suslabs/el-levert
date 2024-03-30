CREATE TABLE "Tags" (
	"hops"	TEXT,
	"name"	TEXT,
	"body"	TEXT,
	"owner"	TEXT,
	"args"	TEXT,
	"registered"	INTEGER,
	"lastEdited"	INTEGER,
	"type"	INTEGER,
	PRIMARY KEY("name"),
	FOREIGN KEY("owner") REFERENCES Quotas("user")
);
---
CREATE TABLE "Quotas" (
	"user"	TEXT,
	"quota"	REAL,
	PRIMARY KEY("user")
);