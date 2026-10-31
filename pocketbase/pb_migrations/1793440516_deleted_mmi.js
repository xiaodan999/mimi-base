/// <reference path="../pb_data/types.d.ts" />

// Drop the legacy "mimi" feed if this database still has it. Fresh installs
// never create it, so the lookup may come up empty.
migrate((app) => {
    const mmi = app.findAllCollections().find((c) => c.name === "mmi");
    if (mmi) app.delete(mmi);
});
