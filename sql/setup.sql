-- Run once, connected to the app's database (frenchst), NOT master.
-- Creates a contained SQL user for the web app. Put the same password in the
-- App Service setting SQL_PASSWORD, with SQL_AUTH=sql and SQL_USER=frenchst_app.

CREATE USER frenchst_app WITH PASSWORD = 'Pick-a-long-password-here-1!';
ALTER ROLE db_datareader ADD MEMBER frenchst_app;
ALTER ROLE db_datawriter ADD MEMBER frenchst_app;
ALTER ROLE db_ddladmin  ADD MEMBER frenchst_app;  -- lets the app create its tables on first start

-- Alternative (managed identity, no password): connect as the server's Entra admin and run
--   CREATE USER [48frenchst] FROM EXTERNAL PROVIDER;  then the same ALTER ROLE lines,
-- and set SQL_AUTH=managed-identity with the Web App's system-assigned identity turned on.

-- The app creates its tables on startup: dbo.fs_projects (one JSON document per project,
-- optimistic concurrency on [version]), dbo.fs_plans (PDFs as VARBINARY(MAX)),
-- dbo.fs_revisions (named snapshots).
