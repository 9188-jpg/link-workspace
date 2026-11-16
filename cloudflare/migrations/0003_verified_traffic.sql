-- Preserve legacy request counts separately from browser-confirmed statistics.
ALTER TABLE visits ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE link_events ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_events ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
CREATE INDEX visits_verified_link_time ON visits(verified,link_id,timestamp);
CREATE INDEX events_verified_link_time ON link_events(verified,link_id,visitor,kind,timestamp);
CREATE INDEX document_verified_time ON document_events(verified,document_id,visitor,timestamp);
ALTER TABLE domains ADD COLUMN public_origin TEXT;
