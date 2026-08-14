update public.tools
set category = case category
  when 'Academic & Science' then 'Science'
  when 'Coding & Development' then 'Coding'
  when 'General AI Assistants' then 'General'
  when 'Notes & Knowledge' then 'Notes'
  when 'Presentations & Content' then 'Presentations'
  when 'Research & Search' then 'Research'
  when 'Study & Writing' then 'Writing'
  when 'Visual & Creative' then 'Visual'
  else category
end
where category in (
  'Academic & Science',
  'Coding & Development',
  'General AI Assistants',
  'Notes & Knowledge',
  'Presentations & Content',
  'Research & Search',
  'Study & Writing',
  'Visual & Creative'
);
