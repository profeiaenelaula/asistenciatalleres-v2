import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(url, anonKey);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const csvPath = path.resolve(__dirname, '../../inscripciones-talleres-2026-04-20.csv');
  const fileContent = fs.readFileSync(csvPath, 'utf8');

  // Strip BOM if present
  let cleanContent = fileContent;
  if (cleanContent.charCodeAt(0) === 0xFEFF) {
    cleanContent = cleanContent.slice(1);
  }

  const result = Papa.parse(cleanContent, {
    header: true,
    skipEmptyLines: true,
    delimiter: ';',
  });

  const rows = result.data as any[];
  console.log(`Leídas ${rows.length} filas del Excel.`);

  const workshopsSet = new Set<string>();
  const workshopsMap = new Map<string, string>(); // 'Taller|Nivel' -> uuid

  for (const row of rows) {
    const keys = Object.keys(row);
    const titleKey = keys.find(k => k.includes('Taller')) || keys[0];
    let title = row[titleKey]?.trim();
    const level = row['Nivel']?.trim();
    if (title && level) {
      if (['2° Medio', '3° Medio', '4° Medio'].includes(level) && !title.includes(level)) {
        title = `${title} ${level}`;
      }
      workshopsSet.add(`${title}|${level}`);
    }
  }

  console.log(`Encontrados ${workshopsSet.size} talleres únicos.`);

  // 1. Create or get Workshops
  for (const w of workshopsSet) {
    const [title, level] = w.split('|');
    let { data: existingWorkshop } = await supabase
      .from('workshops')
      .select('id')
      .eq('title', title)
      .eq('target_level', level)
      .maybeSingle();

    if (!existingWorkshop) {
      const { data: newWorkshop, error } = await supabase
        .from('workshops')
        .insert({
          title,
          target_level: level,
          capacity: 40,
          is_active: true,
          teacher: 'Sin Asignar'
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error insertando taller:', error);
        continue;
      }
      existingWorkshop = newWorkshop;
    }
    workshopsMap.set(w, existingWorkshop!.id);
  }

  // 2. Insert Students & Enrollments
  console.log('Procesando estudiantes...');
  for (const row of rows) {
    const keys = Object.keys(row);
    const titleKey = keys.find(k => k.includes('Taller')) || keys[0];
    
    const fullName = row['Estudiante']?.trim();
    const rut = row['RUT']?.trim();
    const course = row['Curso']?.trim();
    let workshopTitle = row[titleKey]?.trim();
    const level = row['Nivel']?.trim();

    if (workshopTitle && level && ['2° Medio', '3° Medio', '4° Medio'].includes(level) && !workshopTitle.includes(level)) {
      workshopTitle = `${workshopTitle} ${level}`;
    }

    if (!rut || !workshopTitle) continue;

    // Check student
    const { data: existingStudent } = await supabase
      .from('students')
      .select('id')
      .eq('rut', rut)
      .maybeSingle();

    if (!existingStudent) {
      await supabase.from('students').insert({
        rut,
        name: fullName,
        course
      });
    } else {
      // Opt: update if name changed?
    }

    const workshopId = workshopsMap.get(`${workshopTitle}|${level}`);
    
    if (workshopId) {
      // Check existing enrollment
      const { data: existingEnrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('student_rut', rut)
        .eq('workshop_id', workshopId)
        .maybeSingle();

      if (!existingEnrollment) {
        // Enforce 1 enrollment per student if needed, wait, if the CSV has duplicate RUTs in different workshops we should add them if they correspond to different things, but the table rule said student_rut is UNIQUE.
        // Actually, let's just insert/on conflict do nothing or catch error
        const { error } = await supabase.from('enrollments').insert({
          workshop_id: workshopId,
          student_name: fullName,
          student_rut: rut,
          course,
          subject: workshopTitle
        });
        if (error) {
           // We might hit a unique constraint on student_rut if they are already in another workshop
           console.log(`Aviso: No se pudo inscribir a ${fullName} (${rut}):`, error.message);
        }
      }
    }
  }

  console.log('Carga masiva completada exitosamente.');
}

main().catch(console.error);
