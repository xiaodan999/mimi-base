/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX idx_users_legacy_id ON `users` (`legacy_id`) WHERE legacy_id != ''",
      "CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)",
      "CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''"
    ]
  }, collection)

  // add field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text614609615",
    "max": 0,
    "min": 0,
    "name": "user_name",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(11, new Field({
    "help": "",
    "hidden": false,
    "id": "file4013191564",
    "maxSelect": 1,
    "maxSize": 10485760,
    "mimeTypes": [],
    "name": "tou_xiang",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": [
      "200x200"
    ],
    "type": "file"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1721642421",
    "help": "",
    "hidden": false,
    "id": "relation3568788857",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "circle",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(13, new Field({
    "autogeneratePattern": "",
    "help": "",
    "hidden": false,
    "id": "text407476476",
    "max": 0,
    "min": 0,
    "name": "legacy_id",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)",
      "CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''"
    ]
  }, collection)

  // remove field
  collection.fields.removeById("text614609615")

  // remove field
  collection.fields.removeById("file4013191564")

  // remove field
  collection.fields.removeById("relation3568788857")

  // remove field
  collection.fields.removeById("text407476476")

  return app.save(collection)
})
