import { Injectable } from "@nestjs/common";
import type { OrgRole } from "@workmesh/core";
import { Db } from "../../common/db.service";

export interface Person {
  id: string;
  name: string;
  title: string;
  email: string;
  avatarHue: number;
  role: OrgRole;
  active: boolean;
  location: string | null;
  teams: Array<{ id: string; name: string; role: "MEMBER" | "LEAD"; isPrimary: boolean }>;
  primaryTeamId: string | null;
  departmentId: string | null;
  managerId: string | null;
}

export type PersonLite = Pick<Person, "id" | "name" | "title" | "avatarHue" | "active">;

/**
 * The organization's directory, loaded once per request (≤ a few hundred rows for the target
 * company size) so that every presenter can resolve people without N+1 queries.
 * Directory data (name, title, team, manager) is organization-visible by design; work data is not.
 */
@Injectable()
export class PeopleService {
  constructor(private readonly db: Db) {}

  all(): Promise<Map<string, Person>> {
    return this.db.memo("people", async () => {
      const tx = this.db.tx;
      const [profiles, teamMemberships, lines] = await Promise.all([
        tx.employeeProfile.findMany({
          include: { membership: { select: { role: true, status: true } } },
          orderBy: { displayName: "asc" },
        }),
        tx.teamMembership.findMany({
          where: { endedAt: null },
          include: { team: { select: { id: true, name: true, departmentId: true } } },
        }),
        tx.reportingLine.findMany({ where: { endedAt: null, type: "PRIMARY" }, select: { reportId: true, managerId: true } }),
      ]);
      const managerOf = new Map(lines.map((l) => [l.reportId, l.managerId]));
      const map = new Map<string, Person>();
      for (const p of profiles) {
        map.set(p.membershipId, {
          id: p.membershipId,
          name: p.displayName,
          title: p.title,
          email: p.workEmail,
          avatarHue: p.avatarHue,
          role: p.membership.role,
          active: p.membership.status === "ACTIVE",
          location: p.location,
          teams: [],
          primaryTeamId: null,
          departmentId: null,
          managerId: managerOf.get(p.membershipId) ?? null,
        });
      }
      for (const tm of teamMemberships) {
        const person = map.get(tm.membershipId);
        if (!person) continue;
        person.teams.push({ id: tm.team.id, name: tm.team.name, role: tm.role, isPrimary: tm.isPrimary });
        if (tm.isPrimary || !person.primaryTeamId) {
          person.primaryTeamId = tm.team.id;
          person.departmentId = tm.team.departmentId;
        }
      }
      return map;
    });
  }

  async lite(id: string | null | undefined): Promise<PersonLite | null> {
    if (!id) return null;
    const p = (await this.all()).get(id);
    return p ? { id: p.id, name: p.name, title: p.title, avatarHue: p.avatarHue, active: p.active } : null;
  }

  /** Resolves a list of ids into lite records, preserving order and dropping unknown ids. */
  async many(ids: Array<string | null | undefined>): Promise<PersonLite[]> {
    const all = await this.all();
    return ids
      .filter((id): id is string => !!id && all.has(id))
      .map((id) => {
        const p = all.get(id)!;
        return { id: p.id, name: p.name, title: p.title, avatarHue: p.avatarHue, active: p.active };
      });
  }

  liteOf(p: Person | undefined): PersonLite | null {
    return p ? { id: p.id, name: p.name, title: p.title, avatarHue: p.avatarHue, active: p.active } : null;
  }
}
