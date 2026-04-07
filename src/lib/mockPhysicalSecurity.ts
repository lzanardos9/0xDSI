import { supabase } from './supabase';

const MOCK_PERSONNEL = [
  {
    person_id: 'EMP-001',
    person_name: 'John Smith',
    clearance_level: 'level-3',
    badge_type: 'employee',
    path: [
      { x: 95, y: 65, zone: 'Rack Row A' },
      { x: 110, y: 65, zone: 'Rack Row A' },
      { x: 125, y: 65, zone: 'Rack Row A' },
      { x: 125, y: 85, zone: 'Rack Row A' },
      { x: 110, y: 100, zone: 'Rack Row A' },
      { x: 95, y: 115, zone: 'Rack Row B' },
      { x: 110, y: 125, zone: 'Rack Row B' },
    ],
  },
  {
    person_id: 'EMP-002',
    person_name: 'Sarah Johnson',
    clearance_level: 'level-4',
    badge_type: 'employee',
    path: [
      { x: 370, y: 155, zone: 'Power Distribution' },
      { x: 370, y: 170, zone: 'Power Distribution' },
      { x: 370, y: 185, zone: 'Power Distribution' },
      { x: 370, y: 170, zone: 'Power Distribution' },
      { x: 370, y: 155, zone: 'Power Distribution' },
    ],
  },
  {
    person_id: 'CON-001',
    person_name: 'Mike Davis',
    clearance_level: 'level-2',
    badge_type: 'contractor',
    path: [
      { x: 130, y: 128, zone: 'Rack Row B' },
      { x: 145, y: 128, zone: 'Rack Row B' },
      { x: 160, y: 128, zone: 'Rack Row B' },
      { x: 145, y: 128, zone: 'Rack Row B' },
      { x: 130, y: 128, zone: 'Rack Row B' },
      { x: 115, y: 128, zone: 'Rack Row B' },
      { x: 100, y: 128, zone: 'Rack Row B' },
    ],
  },
  {
    person_id: 'EMP-003',
    person_name: 'Emily Chen',
    clearance_level: 'level-2',
    badge_type: 'employee',
    path: [
      { x: 485, y: 85, zone: 'Network Operations Center' },
      { x: 495, y: 85, zone: 'Network Operations Center' },
      { x: 505, y: 85, zone: 'Network Operations Center' },
      { x: 495, y: 85, zone: 'Network Operations Center' },
      { x: 485, y: 85, zone: 'Network Operations Center' },
    ],
  },
  {
    person_id: 'VIS-001',
    person_name: 'Robert Brown',
    clearance_level: 'level-1',
    badge_type: 'visitor',
    path: [
      { x: 95, y: 310, zone: 'Main Entrance' },
      { x: 105, y: 305, zone: 'Main Entrance' },
      { x: 115, y: 300, zone: 'Main Entrance' },
      { x: 125, y: 295, zone: 'Main Entrance' },
      { x: 135, y: 290, zone: 'Main Entrance' },
      { x: 145, y: 285, zone: 'Main Entrance' },
    ],
  },
  {
    person_id: 'UNK-001',
    person_name: 'Unknown Person',
    clearance_level: 'level-1',
    badge_type: 'unknown',
    path: [
      { x: 265, y: 195, zone: 'CRAC Room' },
      { x: 270, y: 190, zone: 'CRAC Room' },
      { x: 275, y: 185, zone: 'CRAC Room' },
      { x: 270, y: 180, zone: 'CRAC Room' },
      { x: 265, y: 175, zone: 'CRAC Room' },
    ],
  },
  {
    person_id: 'EMP-004',
    person_name: 'David Lee',
    clearance_level: 'level-2',
    badge_type: 'employee',
    path: [
      { x: 60, y: 185, zone: 'Rack Row C' },
      { x: 75, y: 185, zone: 'Rack Row C' },
      { x: 90, y: 185, zone: 'Rack Row C' },
      { x: 105, y: 185, zone: 'Rack Row C' },
      { x: 120, y: 185, zone: 'Rack Row C' },
      { x: 135, y: 185, zone: 'Rack Row C' },
      { x: 150, y: 185, zone: 'Rack Row C' },
    ],
  },
  {
    person_id: 'EMP-005',
    person_name: 'Lisa Wang',
    clearance_level: 'level-3',
    badge_type: 'employee',
    path: [
      { x: 55, y: 245, zone: 'Rack Row D' },
      { x: 70, y: 245, zone: 'Rack Row D' },
      { x: 85, y: 245, zone: 'Rack Row D' },
      { x: 100, y: 245, zone: 'Rack Row D' },
      { x: 115, y: 245, zone: 'Rack Row D' },
    ],
  },
];

const pathIndexes = new Map<string, number>();

export const startMockPersonnelMovement = () => {
  MOCK_PERSONNEL.forEach((person) => {
    pathIndexes.set(person.person_id, 0);
  });

  const updatePersonnelPositions = async () => {
    const updates = MOCK_PERSONNEL.map(async (person) => {
      const currentIndex = pathIndexes.get(person.person_id) || 0;
      const nextIndex = (currentIndex + 1) % person.path.length;
      pathIndexes.set(person.person_id, nextIndex);

      const position = person.path[nextIndex];

      const zone = await supabase
        .from('physical_zones')
        .select('id')
        .eq('zone_name', position.zone)
        .maybeSingle();

      const { data: existing } = await supabase
        .from('personnel_tracking')
        .select('id')
        .eq('person_id', person.person_id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('personnel_tracking')
          .update({
            position: { x: position.x, y: position.y },
            current_zone_id: zone.data?.id,
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('person_id', person.person_id);
      } else {
        await supabase
          .from('personnel_tracking')
          .insert({
            person_id: person.person_id,
            person_name: person.person_name,
            clearance_level: person.clearance_level,
            badge_type: person.badge_type,
            position: { x: position.x, y: position.y },
            current_zone_id: zone.data?.id,
            last_seen: new Date().toISOString(),
          });
      }

      if (person.badge_type === 'unknown' && Math.random() > 0.7) {
        const { data: existingEvent } = await supabase
          .from('physical_security_events')
          .select('id')
          .eq('person_id', person.person_id)
          .eq('status', 'active')
          .maybeSingle();

        if (!existingEvent) {
          const cameraData = await supabase
            .from('cctv_cameras')
            .select('id')
            .eq('camera_id', 'CAM-007')
            .maybeSingle();

          await supabase
            .from('physical_security_events')
            .insert({
              event_type: 'unauthorized_access',
              severity: 'critical',
              zone_id: zone.data?.id,
              camera_id: cameraData.data?.id,
              person_id: person.person_id,
              description: 'Unidentified person detected in restricted CRAC room without proper clearance',
              position: { x: position.x, y: position.y },
              status: 'active',
            });
        }
      }
    });

    await Promise.all(updates);
  };

  updatePersonnelPositions();

  const interval = setInterval(updatePersonnelPositions, 4000);

  return () => clearInterval(interval);
};
