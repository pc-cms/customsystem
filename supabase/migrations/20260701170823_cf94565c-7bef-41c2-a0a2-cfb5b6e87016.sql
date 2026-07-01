UPDATE public.employees
SET first_name = regexp_replace(first_name, '^TR\s+', ''),
    full_name  = regexp_replace(full_name, '^TR\s+', ''),
    dealer_category = 'Trainee'
WHERE casino_id='1d71e231-8ef9-40aa-bc5d-75274f4945d3'
  AND (full_name LIKE 'TR %' OR first_name LIKE 'TR %');