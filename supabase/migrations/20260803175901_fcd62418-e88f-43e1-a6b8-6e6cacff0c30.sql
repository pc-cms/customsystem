INSERT INTO public.user_casino_access (user_id, casino_id, granted_by)
SELECT '9a70b2d5-77d5-4aa8-a972-32340d5494c8'::uuid, c.id, '9a70b2d5-77d5-4aa8-a972-32340d5494c8'::uuid
FROM public.casinos c
ON CONFLICT DO NOTHING;