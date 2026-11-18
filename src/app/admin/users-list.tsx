'use client';
import { ActionIcon, Avatar, Badge, Group, Menu, Text, Tooltip } from '@mantine/core';
import { FiCalendar, FiFileText, FiInfo, FiLogIn, FiMail, FiMoreVertical, FiPause, FiPlay, FiShield, FiTrash2, FiUserCheck } from 'react-icons/fi';
import { MdVerified } from 'react-icons/md';
import styles from './admin.module.css';

export type UserRow = {
  id: string; username?: string; email?: string; role?: string; status: string; created_at: string; email_verified_at?: string | null;
  verified?: boolean; verified_by_admin?: boolean; ad_count?: number; last_login?: string | null; verification_status?: string | null;
};
type Actions = {
  busy: boolean;
  viewAds: (user: UserRow) => void;
  toggleVerified: (user: UserRow) => void;
  toggleStatus: (user: UserRow) => void;
  signInAs: (user: UserRow) => void;
  remove: (user: UserRow) => void;
};

const colors = ['indigo', 'teal', 'grape', 'orange', 'cyan', 'pink', 'violet', 'lime', 'blue', 'red'];
const colorFor = (name = '') => colors[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % colors.length];
const short = (value?: string | null) => value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';
function ago(value?: string | null) {
  if (!value) return 'never signed in';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  return days < 1 ? 'active today' : days < 30 ? `active ${days}d ago` : `active ${short(value)}`;
}

/** Compact member list: who they are at a glance; details and actions live in the menu. */
export function UsersList({ rows, actions }: { rows: UserRow[]; actions: Actions }) {
  return <ul className={styles.userList}>
    {rows.map((user) => {
      const name = user.username || 'user';
      const active = user.status === 'active';
      return <li key={user.id} className={styles.userRow} data-status={user.status}>
        <div className={styles.userAvatar}>
          <Avatar radius="xl" size={42} color={colorFor(name)} variant="filled">{name.slice(0, 2).toUpperCase()}</Avatar>
          <span className={styles.userDot} data-status={user.status} title={user.status} />
        </div>
        <div className={styles.userText}>
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <Text fw={700} size="sm" truncate style={{ minWidth: 0 }}>@{name}</Text>
            {user.verified && <Tooltip label={user.verified_by_admin ? 'Verified by an admin' : 'Verified with a photo'}><span className={styles.userVerified}><MdVerified /></span></Tooltip>}
            {user.role !== 'member' && <Badge size="xs" variant="light" color="dark" radius="sm">{user.role}</Badge>}
          </Group>
          <Text size="xs" c="dimmed" truncate>{user.email}</Text>
          <Text size="xs" c="dimmed" className={styles.userMeta}>{user.ad_count ?? 0} ad{user.ad_count === 1 ? '' : 's'} · {ago(user.last_login)}</Text>
        </div>
        {!active && <Badge size="sm" variant="light" color={user.status === 'suspended' ? 'orange' : 'gray'} radius="sm" className={styles.userState}>{user.status}</Badge>}
        <Tooltip multiline w={230} withArrow position="left" events={{ hover: true, focus: true, touch: true }} label={<div className={styles.userDetails}>
              <Text fw={700} size="sm">@{name}</Text>
              <span><FiMail /> {user.email_verified_at ? 'Email verified' : 'Email not verified'}</span>
              <span><FiCalendar /> Joined {short(user.created_at)}</span>
              <span><FiLogIn /> Last sign-in {short(user.last_login)}</span>
              <span><FiShield /> {user.verified ? (user.verified_by_admin ? 'Verified by admin' : 'Verified with photo') : user.verification_status === 'pending' ? 'Verification waiting for review' : 'Not verified'}</span>
            </div>}>
          <ActionIcon variant="subtle" color="gray" size="md" radius="xl" aria-label={'Details for ' + name}><FiInfo size={16} /></ActionIcon>
        </Tooltip>
        <Menu withinPortal position="bottom-end" width={220} shadow="md">
          <Menu.Target><ActionIcon variant="subtle" color="gray" size="lg" radius="xl" aria-label={'Details and actions for ' + name}><FiMoreVertical size={18} /></ActionIcon></Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<FiFileText />} onClick={() => actions.viewAds(user)}>View ads ({user.ad_count ?? 0})</Menu.Item>
            <Menu.Item color={user.verified_by_admin ? 'gray' : 'green'} disabled={actions.busy || (Boolean(user.verified) && !user.verified_by_admin)} leftSection={<MdVerified />} onClick={() => actions.toggleVerified(user)}>{user.verified_by_admin ? 'Remove Verified badge' : user.verified ? 'Verified (approved photo)' : 'Mark as Verified'}</Menu.Item>
            <Menu.Item disabled={user.role === 'admin' || actions.busy} color={active ? 'orange' : 'teal'} leftSection={active ? <FiPause /> : <FiPlay />} onClick={() => actions.toggleStatus(user)}>{active ? 'Suspend account' : 'Restore account'}</Menu.Item>
            <Menu.Item disabled={user.role !== 'member' || !active} leftSection={<FiUserCheck />} onClick={() => actions.signInAs(user)}>Sign in as user</Menu.Item>
            <Menu.Divider />
            <Menu.Item disabled={user.role !== 'member'} color="red" leftSection={<FiTrash2 />} onClick={() => actions.remove(user)}>Delete account</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </li>;
    })}
  </ul>;
}
