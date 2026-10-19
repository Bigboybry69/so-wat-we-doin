-- One-time, explicitly requested cleanup. Delete only one unambiguous match.
with matches as materialized (
 select e.id from doin_private.events e
 join doin_private.groups g on g.id=e.gid
 where lower(btrim(e.title))='meh'
 and lower(regexp_replace(btrim(g.name),'[[:space:]]+',' ','g')) in ('crib','the crib')
), removed as (
 delete from doin_private.events e using matches m
 where e.id=m.id and (select count(*) from matches)=1
 returning e.id
)
select (select count(*)::int from matches) as matched,
       (select count(*)::int from removed) as deleted;
