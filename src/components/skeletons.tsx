import styles from './skeletons.module.css';

const Bone = ({ w, h = 12 }: { w: string; h?: number }) => <span className={styles.bone} style={{ width: w, height: h }} />;

/** Matches the ads list: toolbar, search box and post cards. */
export function ListingSkeleton({ gallery = false, count = 6, tools = false }: { gallery?: boolean; count?: number; tools?: boolean }) {
  return <div role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">Loading ads</span>
    {tools && <><div className={styles.tools} aria-hidden="true"><Bone w="60%" h={38} /><Bone w="40%" h={38} /></div><div className={styles.tools} aria-hidden="true"><Bone w="100%" h={38} /></div></>}
    <ul className={`${styles.list} ${gallery ? styles.gallery : ''}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => <li key={index} className={styles.card}>
        <span className={styles.bone} />
        <span className={styles.lines}><Bone w="34%" h={10} /><Bone w={index % 2 ? '72%' : '88%'} h={15} /><Bone w="95%" /><Bone w="64%" /><Bone w="22%" h={11} /></span>
      </li>)}
    </ul>
  </div>;
}

/** Matches the ad page: title, picture frame, thumbnails, facts and description. */
export function DetailSkeleton({ crumbs = true }: { crumbs?: boolean }) {
  return <div className={styles.detail} role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">Loading ad</span>
    <div aria-hidden="true" className={styles.detail}>
      {crumbs && <Bone w="42%" h={13} />}
      <Bone w="78%" h={24} /><Bone w="28%" h={12} />
      <span className={`${styles.bone} ${styles.frame}`} />
      <div className={styles.thumbs}><span className={styles.bone} /><span className={styles.bone} /><span className={styles.bone} /></div>
      <div className={styles.facts}><Bone w="24%" /><Bone w="48%" /><Bone w="38%" /><Bone w="52%" /></div>
      <Bone w="36%" h={18} /><Bone w="100%" /><Bone w="96%" /><Bone w="88%" /><Bone w="60%" />
    </div>
  </div>;
}

/** Matches the description editor: toolbar and writing area. */
export function EditorSkeleton() {
  return <div className={styles.editor} role="status" aria-busy="true"><span className="sr-only">Loading the editor</span>
    <div aria-hidden="true" className={styles.editorBar}><Bone w="24px" h={24} /><Bone w="24px" h={24} /><Bone w="24px" h={24} /><Bone w="24px" h={24} /></div>
    <div aria-hidden="true" className={styles.editorBody}><Bone w="90%" /><Bone w="75%" /><Bone w="82%" /></div>
  </div>;
}

/** Matches the Post an Ad form: heading and its sections of fields. */
export function FormSkeleton() {
  return <div className={styles.form} role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">Loading the posting form</span>
    <div aria-hidden="true" className={styles.form}>
      <div className={styles.field}><Bone w="38%" h={26} /><Bone w="70%" /></div>
      {[5, 4, 1].map((fields, section) => <div key={section} className={styles.section}>
        <Bone w="40%" h={18} />
        <div className={styles.fields}>{Array.from({ length: fields }, (_, index) => <div key={index} className={styles.field}><Bone w="35%" h={11} /><span className={styles.bone} /></div>)}</div>
      </div>)}
    </div>
  </div>;
}
