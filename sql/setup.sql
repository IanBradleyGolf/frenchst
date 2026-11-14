-- Run once against the app's database (e.g. in the Azure portal Query editor,
-- signed in as the server's Entra admin). Replace <web-app-name> with the
-- App Service name; its system-assigned managed identity has the same name.

CREATE USER [<web-app-name>] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [<web-app-name>];
ALTER ROLE db_datawriter ADD MEMBER [<web-app-name>];
ALTER ROLE db_ddladmin  ADD MEMBER [<web-app-name>];  -- lets the app create its tables on first start

-- The app creates these tables itself on startup (dbo.fs_projects, dbo.fs_plans,
-- dbo.fs_revisions). They are listed here for reference only.
--
-- fs_projects  : one row per project; the whole layout is JSON in [data],
--                with optimistic concurrency on [version].
-- fs_plans     : uploaded PDF drawings (VARBINARY(MAX)).
-- fs_revisions : named snapshots of a project's JSON (Rev A, Rev B...).
