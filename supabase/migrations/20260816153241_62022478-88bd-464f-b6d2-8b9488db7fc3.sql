UPDATE dealer_attendance da
SET value = CASE r.shift WHEN 'M' THEN '10' WHEN 'N' THEN '12' WHEN 'EM' THEN '10' WHEN 'EN' THEN '12' END
FROM casinos c, pit_rota r
WHERE c.id = da.casino_id
  AND lower(c.name) LIKE '%dodoma%'
  AND r.casino_id = da.casino_id AND r.employee_id = da.employee_id AND r.date = da.date
  AND da.date >= '2026-08-01'
  AND r.shift IN ('M','N','EM','EN')
  AND da.value ~ '^[0-9]+$'
  AND da.value <> (CASE r.shift WHEN 'M' THEN '10' WHEN 'N' THEN '12' WHEN 'EM' THEN '10' WHEN 'EN' THEN '12' END);