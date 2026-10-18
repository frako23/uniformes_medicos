-- Lleva la secuencia de products.legacy_id al máximo valor existente, sin retrocederla.
-- La importación desde Strapi insertó identificadores explícitos que no adelantaron la secuencia.
SELECT setval(s.seq, s.value, true)
FROM (
  SELECT
    pg_get_serial_sequence('products', 'legacy_id') AS seq,
    GREATEST(
      (SELECT COALESCE(MAX(legacy_id), 0) FROM products),
      COALESCE(
        (
          SELECT last_value FROM pg_sequences
          WHERE format('%I.%I', schemaname, sequencename)::regclass = pg_get_serial_sequence('products', 'legacy_id')::regclass
        ),
        0
      )
    ) AS value
) AS s
WHERE s.value > 0;
