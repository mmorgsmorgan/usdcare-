update treatment_escrow_milestones
set label = regexp_replace(label, '^Test[[:space:]]+', 'Session ')
where label ~ '^Test[[:space:]]+[0-9]+$';
