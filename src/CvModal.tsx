/*
 * Read-only CV preview shared by the client book and the consultant workspace.
 *
 * The document itself is fictional demo content embedded with each client, so
 * the same modal works from the admin drawer and from My desk.
 */

import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { ClientCv } from './api';
import { Modal, fmtDate } from './ui';

export type CvClient = {
  name: string;
  email?: string | null;
  targetRole?: string | null;
  targetMarket?: string | null;
  targetCity?: string | null;
};

export default function CvModal({
  open, cv, client, onClose,
}: {
  open: boolean;
  cv: ClientCv;
  client: CvClient;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={`${client.name} · CV`} width={720}>
      <div className="cv-doc">
        <header className="cv-doc-head">
          <div>
            <h2>{client.name}</h2>
            <p className="muted">{client.targetRole || 'Target role TBC'} · {client.targetCity || client.targetMarket || 'Market TBC'}</p>
            <p className="muted small">{client.email || '—'} · {cv.workAuthorization}</p>
          </div>
          <div className="cv-score">
            <span className="num">{cv.atsScore}</span>
            <small>ATS score</small>
          </div>
        </header>

        <section className="cv-section">
          <h4>Profile</h4>
          <p>{cv.summary}</p>
        </section>

        <section className="cv-section">
          <h4>Core skills</h4>
          <div className="board-chips">
            {cv.skills.map((skill) => <span className="board-chip" key={skill}>{skill}</span>)}
          </div>
        </section>

        <section className="cv-section">
          <h4>Experience</h4>
          {cv.experience.map((job) => (
            <div className="cv-job" key={`${job.company}-${job.period}`}>
              <div className="cv-job-head">
                <strong>{job.role}</strong>
                <span className="muted small">{job.period}</span>
              </div>
              <small className="muted">{job.company}</small>
              <ul>
                {job.highlights.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </div>
          ))}
        </section>

        <div className="cv-columns">
          <section className="cv-section">
            <h4>Education</h4>
            {cv.education.map((edu) => (
              <div className="cv-edu" key={`${edu.school}-${edu.year}`}>
                <strong>{edu.degree}</strong>
                <small className="muted">{edu.school} · {edu.year}</small>
              </div>
            ))}
          </section>
          <section className="cv-section">
            <h4>Certifications</h4>
            <ul className="cv-list">
              {cv.certifications.map((cert) => <li key={cert}>{cert}</li>)}
            </ul>
          </section>
        </div>

        <div className="cv-columns">
          <section className="cv-section">
            <h4>Languages</h4>
            <p className="small">{cv.languages.join(' · ')}</p>
          </section>
          <section className="cv-section">
            <h4>Links</h4>
            <div className="row gap8" style={{ flexWrap: 'wrap' }}>
              {cv.links.map((link) => (
                <a className="board-chip" key={link.url} href={link.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={11} /> {link.label}
                </a>
              ))}
            </div>
          </section>
        </div>

        <p className="fineprint">
          {cv.fileName} · {cv.pages} pages · updated {fmtDate(new Date(cv.updatedAt).toISOString().slice(0, 10))}.
          Demo CV content is fictional and stays inside this console.
        </p>
      </div>
    </Modal>
  );
}
