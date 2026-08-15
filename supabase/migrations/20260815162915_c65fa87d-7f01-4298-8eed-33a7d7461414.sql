UPDATE public.shifts
SET opening_float = jsonb_set(
      jsonb_set(
        jsonb_set(opening_float, '{chips}', opening_float->'closing_chips'),
        '{totals,chips_tzs}', to_jsonb(117277000)
      ),
      '{totals,total_tzs}', to_jsonb((opening_float->'totals'->>'TZS')::bigint + 117277000)
    )
WHERE id = '74ea888f-f580-42bc-bdd4-40924cc843f9';