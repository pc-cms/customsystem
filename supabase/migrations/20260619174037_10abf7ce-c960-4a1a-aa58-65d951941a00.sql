-- Backfill: per new rota rule M=11h, N=8h. Fix legacy '9' entries.
UPDATE public.dealer_attendance da
SET value='11'
FROM public.pit_rota pr
WHERE pr.employee_id=da.employee_id AND pr.date=da.date AND pr.casino_id=da.casino_id
  AND da.value='9' AND pr.shift='M';

UPDATE public.dealer_attendance da
SET value='8'
FROM public.pit_rota pr
WHERE pr.employee_id=da.employee_id AND pr.date=da.date AND pr.casino_id=da.casino_id
  AND da.value='9' AND pr.shift='N';