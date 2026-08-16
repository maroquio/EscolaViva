-- Ties the user who signs into the portal to the guardian record of the academics module.
-- A guardian is a person in academics (`guardian`) and a credential in identity (`app_user`):
-- without this column, the board, the report card and the attendance would have no way to get from
-- the signed-in user to that user's children. Null for the administrator, the registrar and the
-- teacher.
-- It comes after 0002 because it references `guardian`, created there.

ALTER TABLE app_user ADD COLUMN guardian_id uuid REFERENCES guardian(id);

-- Every guardian screen starts from the signed-in user; the index leads with network_id, like the rest.
CREATE INDEX app_user_by_guardian ON app_user (network_id, guardian_id);
