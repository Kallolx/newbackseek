'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Drawer,SimpleGrid,UnstyledButton,Text } from '@mantine/core';
import { FiActivity,FiArrowUp,FiFileText,FiFlag,FiGrid,FiImage,FiMapPin,FiMoreHorizontal,FiPlus,FiShield,FiUsers } from 'react-icons/fi';
import { adminRoutes } from './admin-routes';
import styles from './mobile-navigation.module.css';
const tabs=[['Overview','Home',FiGrid],['Ads','Ads',FiFileText],['Publish','Create',FiPlus],['Users','Users',FiUsers]] as const;
const more=[['Media',FiImage],['Reports',FiFlag],['Verification',FiShield],['Bump post',FiArrowUp],['Distribute post',FiMapPin],['System health',FiActivity]] as const;
export function AdminMobileNavigation({onCreate}:{onCreate:()=>void}){
 const path=usePathname();const [opened,setOpened]=useState(false);
 const moreActive=more.some(([name])=>adminRoutes[name]===path);
 return <><nav className={styles.bar} aria-label="Mobile admin navigation">{tabs.map(([name,label,Icon])=><Link key={name} href={adminRoutes[name]} className={name==='Publish'?styles.create:styles.tab} aria-current={path===adminRoutes[name]?'page':undefined} onClick={()=>{setOpened(false);if(name==='Publish')onCreate();}}><span className={styles.icon}><Icon size={20} strokeWidth={1.8}/></span><span>{label}</span></Link>)}<button className={styles.tab} type="button" aria-label="More admin pages" aria-expanded={opened} data-active={moreActive||opened||undefined} onClick={()=>setOpened(true)}><span className={styles.icon}><FiMoreHorizontal size={22}/></span><span>More</span></button></nav>
 <Drawer opened={opened} onClose={()=>setOpened(false)} position="bottom" size="auto" title="More admin pages" radius="lg" padding="md" classNames={{content:styles.sheet,header:styles.sheetHeader,body:styles.sheetBody}}><SimpleGrid cols={3} spacing="xs">{more.map(([name,Icon])=><UnstyledButton component={Link} href={adminRoutes[name]} key={name} className={styles.shortcut} data-active={path===adminRoutes[name]||undefined} onClick={()=>setOpened(false)}><span><Icon size={22}/></span><Text size="xs" fw={600} ta="center">{name}</Text></UnstyledButton>)}</SimpleGrid></Drawer></>;
}
